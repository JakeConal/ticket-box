package com.ticketbox.vip;

import com.ticketbox.auth.service.AuthenticatedUserService;
import com.ticketbox.auth.service.OrganizerOwnershipService;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/vip-imports")
public class AdminVipImportController {

    private static final long MAX_CSV_BYTES = 5L * 1024L * 1024L;

    private final VipGuestImportService importService;
    private final AuthenticatedUserService authenticatedUserService;
    private final OrganizerOwnershipService organizerOwnershipService;
    private final VipImportProperties vipImportProperties;

    public AdminVipImportController(
            VipGuestImportService importService,
            AuthenticatedUserService authenticatedUserService,
            OrganizerOwnershipService organizerOwnershipService,
            VipImportProperties vipImportProperties) {
        this.importService = importService;
        this.authenticatedUserService = authenticatedUserService;
        this.organizerOwnershipService = organizerOwnershipService;
        this.vipImportProperties = vipImportProperties;
    }

    @PostMapping
    List<VipGuestImportSummaryResponse> importNow() {
        return importService.processPendingImports(Optional.of(authenticatedUserService.requireCurrentUser().id()));
    }

    @PostMapping("/upload")
    public List<VipGuestImportSummaryResponse> uploadAndImport(
            @RequestParam("concertId") UUID concertId,
            @RequestParam("file") MultipartFile file) {
        organizerOwnershipService.requireOwnedConcert(concertId);
        if (file == null
                || file.isEmpty()
                || file.getOriginalFilename() == null
                || !file.getOriginalFilename().toLowerCase(Locale.ROOT).endsWith(".csv")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid CSV file is required");
        }
        if (file.getSize() > MAX_CSV_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "VIP CSV exceeds the 5MB limit");
        }

        String originalFileName = safeFileName(file.getOriginalFilename());
        Path dir = vipImportProperties.getVipDir().toAbsolutePath().normalize();
        Path dest = dir.resolve(UUID.randomUUID() + "_" + originalFileName).normalize();
        if (!dest.startsWith(dir)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid CSV file name");
        }
        try {
            Files.createDirectories(dir);
            Files.copy(file.getInputStream(), dest);
            UUID organizerId = authenticatedUserService.requireCurrentUser().id();
            return List.of(importService.processUploadedImport(
                    dest,
                    originalFileName,
                    organizerId,
                    concertId));
        } catch (IOException ex) {
            deleteUpload(dest, ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save uploaded VIP CSV", ex);
        } catch (RuntimeException ex) {
            deleteUpload(dest, ex);
            throw ex;
        }
    }

    private void deleteUpload(Path path, Exception originalError) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException cleanupError) {
            originalError.addSuppressed(cleanupError);
        }
    }

    private String safeFileName(String originalFileName) {
        String normalized = originalFileName.replace('\\', '/');
        String baseName = normalized.substring(normalized.lastIndexOf('/') + 1);
        String safe = baseName.replaceAll("[^A-Za-z0-9._-]", "_");
        if (safe.length() > 180) {
            safe = safe.substring(safe.length() - 180);
        }
        return safe.isBlank() ? "vip-guests.csv" : safe;
    }
}
