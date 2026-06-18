package com.ticketbox.vip;

import com.ticketbox.auth.service.AuthenticatedUserService;
import java.util.List;
import java.util.Optional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/vip-imports")
public class AdminVipImportController {

    private final VipGuestImportService importService;
    private final AuthenticatedUserService authenticatedUserService;

    public AdminVipImportController(
            VipGuestImportService importService,
            AuthenticatedUserService authenticatedUserService) {
        this.importService = importService;
        this.authenticatedUserService = authenticatedUserService;
    }

    @PostMapping
    List<VipGuestImportSummaryResponse> importNow() {
        return importService.processPendingImports(Optional.of(authenticatedUserService.requireCurrentUser().id()));
    }
}
