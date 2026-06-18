package com.ticketbox.vip;

public record VipGuestImportSummaryResponse(
        String fileName,
        int totalRows,
        int inserted,
        int updated,
        int deactivated,
        int skipped,
        int errored,
        boolean archived,
        String archive,
        String message) {
}
