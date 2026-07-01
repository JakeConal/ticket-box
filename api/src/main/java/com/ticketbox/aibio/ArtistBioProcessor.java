package com.ticketbox.aibio;

import java.nio.file.Path;
import java.util.UUID;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class ArtistBioProcessor {

    static final String TEXT_EXTRACTION_FAILED = "Text extraction failed - please upload a text-based PDF";
    static final String AI_GENERATION_FAILED = "AI generation failed - please try again";
    static final String AI_SERVICE_BUSY = "AI service busy - please try again later";

    private final ArtistPdfStorage storage;
    private final PdfTextExtractor pdfTextExtractor;
    private final ArtistBioGenerator artistBioGenerator;
    private final ArtistBioProperties properties;
    private final ArtistBioService artistBioService;

    public ArtistBioProcessor(
            ArtistPdfStorage storage,
            PdfTextExtractor pdfTextExtractor,
            ArtistBioGenerator artistBioGenerator,
            ArtistBioProperties properties,
            ArtistBioService artistBioService) {
        this.storage = storage;
        this.pdfTextExtractor = pdfTextExtractor;
        this.artistBioGenerator = artistBioGenerator;
        this.properties = properties;
        this.artistBioService = artistBioService;
    }

    @Async
    public void process(UUID concertId, long generationId, String pdfUri) {
        try {
            Path path = storage.pathFor(pdfUri);
            String text = pdfTextExtractor.extract(path);
            if (!StringUtils.hasText(text) || text.length() < properties.getMinExtractedChars()) {
                artistBioService.markFailedIfCurrent(concertId, generationId, TEXT_EXTRACTION_FAILED);
                return;
            }
            String generated = generateWithRetry(text);
            artistBioService.saveDraftIfCurrent(concertId, generationId, generated);
        } catch (PdfExtractionException ex) {
            artistBioService.markFailedIfCurrent(concertId, generationId, TEXT_EXTRACTION_FAILED);
        } catch (ArtistBioGenerationException ex) {
            artistBioService.markFailedIfCurrent(
                    concertId,
                    generationId,
                    ex.isQuotaExceeded() ? AI_SERVICE_BUSY : AI_GENERATION_FAILED);
        } catch (RuntimeException ex) {
            artistBioService.markFailedIfCurrent(concertId, generationId, AI_GENERATION_FAILED);
        }
    }

    private String generateWithRetry(String text) {
        ArtistBioGenerationException last = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                return artistBioGenerator.generateBio(text);
            } catch (ArtistBioGenerationException ex) {
                last = ex;
                if (attempt < 2) {
                    sleepBackoff(attempt);
                }
            }
        }
        throw last == null ? new ArtistBioGenerationException("AI generation failed", false) : last;
    }

    private void sleepBackoff(int attempt) {
        try {
            Thread.sleep((long) Math.pow(2, attempt) * 250L);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ArtistBioGenerationException("AI retry interrupted", false, ex);
        }
    }
}
