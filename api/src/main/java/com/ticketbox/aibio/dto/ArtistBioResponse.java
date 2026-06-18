package com.ticketbox.aibio.dto;

import com.ticketbox.concert.model.BioStatus;
import com.ticketbox.concert.model.Concert;
import java.util.UUID;

public record ArtistBioResponse(
        UUID concertId,
        BioStatus bioStatus,
        long bioGenerationId,
        String artistPdfUri,
        String artistBioDraft,
        String bioError,
        String publicArtistBio) {

    public static ArtistBioResponse from(Concert concert) {
        return new ArtistBioResponse(
                concert.getId(),
                concert.getBioStatus(),
                concert.getBioGenerationId(),
                concert.getArtistPdfUri(),
                concert.getArtistBioDraft(),
                concert.getBioError(),
                concert.getArtistBio());
    }
}
