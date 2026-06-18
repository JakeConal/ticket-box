package com.ticketbox.aibio;

import java.io.IOException;
import java.io.Writer;
import java.nio.file.Path;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;

@Service
public class PdfTextExtractor {

    private final ArtistBioProperties properties;

    public PdfTextExtractor(ArtistBioProperties properties) {
        this.properties = properties;
    }

    public String extract(Path path) {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<String> future = executor.submit(() -> extractInWorker(path));
            return future.get(properties.getExtractionTimeout().toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException ex) {
            throw new PdfExtractionException("PDF text extraction timed out", ex);
        } catch (PdfExtractionException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new PdfExtractionException("PDF text extraction failed", ex);
        } finally {
            executor.shutdownNow();
        }
    }

    private String extractInWorker(Path path) {
        try (PDDocument document = Loader.loadPDF(path.toFile())) {
            if (document.isEncrypted()) {
                throw new PdfExtractionException("Encrypted PDFs are not supported");
            }
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(1);
            stripper.setEndPage(Math.min(document.getNumberOfPages(), properties.getMaxPages()));
            BoundedStringWriter writer = new BoundedStringWriter(properties.getMaxExtractedChars());
            stripper.writeText(document, writer);
            return writer.toString().replaceAll("\\s+", " ").trim();
        } catch (IOException ex) {
            throw new PdfExtractionException("PDF text extraction failed", ex);
        }
    }

    private static class BoundedStringWriter extends Writer {

        private final int maxChars;
        private final StringBuilder builder = new StringBuilder();

        BoundedStringWriter(int maxChars) {
            this.maxChars = maxChars;
        }

        @Override
        public void write(char[] cbuf, int off, int len) throws IOException {
            if (builder.length() + len > maxChars) {
                int allowed = Math.max(0, maxChars - builder.length());
                if (allowed > 0) {
                    builder.append(cbuf, off, allowed);
                }
                throw new IOException("Extracted text exceeded character limit");
            }
            builder.append(cbuf, off, len);
        }

        @Override
        public void flush() {
        }

        @Override
        public void close() {
        }

        @Override
        public String toString() {
            return builder.toString();
        }
    }
}
