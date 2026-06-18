package com.ticketbox.aibio;

import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.auth.service.AuthenticatedUserService;
import com.ticketbox.concert.cache.ConcertCacheService;
import com.ticketbox.concert.model.BioStatus;
import com.ticketbox.concert.model.Concert;
import com.ticketbox.concert.repository.ConcertRepository;
import com.ticketbox.aibio.dto.ArtistBioEditRequest;
import com.ticketbox.aibio.dto.ArtistBioRejectRequest;
import com.ticketbox.aibio.dto.ArtistBioResponse;
import com.ticketbox.aibio.dto.ArtistPdfUploadResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ArtistBioService {

    private static final byte[] PDF_MAGIC = "%PDF-".getBytes();

    private final ConcertRepository concertRepository;
    private final AuthenticatedUserService authenticatedUserService;
    private final ConcertCacheService concertCacheService;
    private final ArtistBioProperties properties;
    private final ArtistPdfStorage artistPdfStorage;
    private final ArtistBioProcessor artistBioProcessor;
    private final Clock clock;
    private final Map<String, Instant> regenerationAttempts = new ConcurrentHashMap<>();

    public ArtistBioService(
            ConcertRepository concertRepository,
            AuthenticatedUserService authenticatedUserService,
            ConcertCacheService concertCacheService,
            ArtistBioProperties properties,
            ArtistPdfStorage artistPdfStorage,
            @Lazy ArtistBioProcessor artistBioProcessor,
            Clock clock) {
        this.concertRepository = concertRepository;
        this.authenticatedUserService = authenticatedUserService;
        this.concertCacheService = concertCacheService;
        this.properties = properties;
        this.artistPdfStorage = artistPdfStorage;
        this.artistBioProcessor = artistBioProcessor;
        this.clock = clock;
    }

    @Transactional
    public ArtistPdfUploadResponse uploadPressKit(UUID concertId, MultipartFile file) {
        Concert concert = requireOwnedConcert(concertId);
        UserPrincipal organizer = authenticatedUserService.requireCurrentUser();
        enforceRegenerationLimit(organizer.id(), concertId);
        byte[] content = readAndValidatePdf(file);
        long generationId = concert.getBioGenerationId() + 1;
        String uri = artistPdfStorage.store(concertId, generationId, content);
        concert.startBioGeneration(uri, generationId, Instant.now(clock));
        afterCommit(() -> artistBioProcessor.process(concertId, generationId, uri));
        return ArtistPdfUploadResponse.from(concert);
    }

    @Transactional(readOnly = true)
    public ArtistBioResponse getReview(UUID concertId) {
        return ArtistBioResponse.from(requireOwnedConcert(concertId));
    }

    @Transactional
    public ArtistBioResponse editDraft(UUID concertId, ArtistBioEditRequest request) {
        Concert concert = requireOwnedConcert(concertId);
        concert.editBioDraft(request.draftText().trim(), Instant.now(clock));
        concertCacheService.invalidateConcert(concertId);
        return ArtistBioResponse.from(concert);
    }

    @Transactional
    public ArtistBioResponse publish(UUID concertId) {
        Concert concert = requireOwnedConcert(concertId);
        concert.publishBio(Instant.now(clock));
        concertCacheService.invalidateConcert(concertId);
        return ArtistBioResponse.from(concert);
    }

    @Transactional
    public ArtistBioResponse reject(UUID concertId, ArtistBioRejectRequest request) {
        Concert concert = requireOwnedConcert(concertId);
        concert.rejectBio(request == null ? null : request.reason(), Instant.now(clock));
        return ArtistBioResponse.from(concert);
    }

    @Transactional
    public boolean saveDraftIfCurrent(UUID concertId, long generationId, String generatedText) {
        return concertRepository.findById(concertId)
                .map(concert -> concert.saveBioDraftIfCurrent(generationId, generatedText, Instant.now(clock)))
                .orElse(false);
    }

    @Transactional
    public boolean markFailedIfCurrent(UUID concertId, long generationId, String reason) {
        return concertRepository.findById(concertId)
                .map(concert -> concert.failBioIfCurrent(generationId, reason, Instant.now(clock)))
                .orElse(false);
    }

    @Transactional
    public int reapStuckGenerating() {
        Instant cutoff = Instant.now(clock).minus(properties.getReaperThreshold());
        return concertRepository.markStuckGeneratingFailed(cutoff, Instant.now(clock));
    }

    private Concert requireOwnedConcert(UUID concertId) {
        UserPrincipal organizer = authenticatedUserService.requireCurrentUser();
        Concert concert = concertRepository.findById(concertId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Concert not found"));
        if (!concert.getCreatedBy().equals(organizer.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Concert is not owned by this organizer");
        }
        return concert;
    }

    private void enforceRegenerationLimit(UUID organizerId, UUID concertId) {
        if (properties.getRegenerationMinInterval().isZero()
                || properties.getRegenerationMinInterval().isNegative()) {
            return;
        }
        String key = organizerId + ":" + concertId;
        Instant now = Instant.now(clock);
        Instant previous = regenerationAttempts.put(key, now);
        if (previous != null && previous.plus(properties.getRegenerationMinInterval()).isAfter(now)) {
            regenerationAttempts.put(key, previous);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Artist bio regeneration rate limit exceeded");
        }
    }

    private byte[] readAndValidatePdf(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "PDF file is required");
        }
        if (file.getSize() > properties.getMaxPdfBytes()) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "PDF exceeds 20MB limit");
        }
        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Could not read uploaded PDF", ex);
        }
        if (!hasPdfMagic(content)) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Uploaded file is not a real PDF");
        }
        try (PDDocument document = Loader.loadPDF(content)) {
            if (document.isEncrypted()) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Encrypted PDFs are not supported");
            }
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "PDF could not be opened", ex);
        }
        return content;
    }

    private boolean hasPdfMagic(byte[] content) {
        if (content.length < PDF_MAGIC.length) {
            return false;
        }
        for (int i = 0; i < PDF_MAGIC.length; i++) {
            if (content[i] != PDF_MAGIC[i]) {
                return false;
            }
        }
        return true;
    }

    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
