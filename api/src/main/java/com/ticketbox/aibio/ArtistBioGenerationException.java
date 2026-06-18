package com.ticketbox.aibio;

public class ArtistBioGenerationException extends RuntimeException {

    private final boolean quotaExceeded;

    public ArtistBioGenerationException(String message, boolean quotaExceeded) {
        super(message);
        this.quotaExceeded = quotaExceeded;
    }

    public ArtistBioGenerationException(String message, boolean quotaExceeded, Throwable cause) {
        super(message, cause);
        this.quotaExceeded = quotaExceeded;
    }

    public boolean isQuotaExceeded() {
        return quotaExceeded;
    }
}
