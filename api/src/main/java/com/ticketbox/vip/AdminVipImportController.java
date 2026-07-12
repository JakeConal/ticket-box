package com.ticketbox.vip;

import com.ticketbox.auth.service.AuthenticatedUserService;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
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

    private final VipGuestImportService importService;
    private final AuthenticatedUserService authenticatedUserService;
    private final VipImportProperties vipImportProperties;

    public AdminVipImportController(
            VipGuestImportService importService,
            AuthenticatedUserService authenticatedUserService,
            VipImportProperties vipImportProperties) {
        this.importService = importService;
        this.authenticatedUserService = authenticatedUserService;
        this.vipImportProperties = vipImportProperties;
    }

    @PostMapping
    List<VipGuestImportSummaryResponse> importNow() {
        return importService.processPendingImports(Optional.of(authenticatedUserService.requireCurrentUser().id()));
    }

    @PostMapping("/upload")
    public List<VipGuestImportSummaryResponse> uploadAndImport(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty() || file.getOriginalFilename() == null || !file.getOriginalFilename().toLowerCase().endsWith(".csv")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid CSV file is required");
        }
        Path dir = vipImportProperties.getVipDir();
        try {
            Files.createDirectories(dir);
            Path dest = dir.resolve(System.currentTimeMillis() + "_" + file.getOriginalFilename());
            Files.copy(file.getInputStream(), dest, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save uploaded VIP CSV", ex);
        }
        return importService.processPendingImports(Optional.of(authenticatedUserService.requireCurrentUser().id()));
    }
}
