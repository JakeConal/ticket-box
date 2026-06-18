package com.ticketbox.aibio;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ArtistBioReaper {

    private final ArtistBioService artistBioService;

    public ArtistBioReaper(ArtistBioService artistBioService) {
        this.artistBioService = artistBioService;
    }

    @Scheduled(fixedDelayString = "${ticketbox.ai.reaper-delay-ms:60000}")
    public void reap() {
        artistBioService.reapStuckGenerating();
    }
}
