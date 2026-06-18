package com.ticketbox.vip;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class VipGuestImportJob {

    private static final Logger log = LoggerFactory.getLogger(VipGuestImportJob.class);

    private final VipGuestImportService importService;

    public VipGuestImportJob(VipGuestImportService importService) {
        this.importService = importService;
    }

    @Scheduled(cron = "${ticketbox.imports.vip-cron:0 0 2 * * *}")
    public void runNightlyImport() {
        log.info("Starting scheduled VIP guest CSV import");
        importService.processPendingImports();
    }
}
