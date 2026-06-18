package com.ticketbox.aibio.dto;

import com.ticketbox.concert.model.BioStatus;
import com.ticketbox.concert.model.Concert;
import java.util.UUID;

public record ArtistPdfUploadResponse(
        UUID concertId,
        BioStatus bioStatus,
        long bioGenerationId,
        String artistPdfUri) {

    public static ArtistPdfUploadResponse from(Concert concert) {
        return new ArtistPdfUploadResponse(
                concert.getId(),
                concert.getBioStatus(),
                concert.getBioGenerationId(),
                concert.getArtistPdfUri());
    }
}
