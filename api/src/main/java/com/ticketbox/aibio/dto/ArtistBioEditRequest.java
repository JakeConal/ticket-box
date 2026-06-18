package com.ticketbox.aibio.dto;

import jakarta.validation.constraints.NotBlank;

public record ArtistBioEditRequest(@NotBlank String draftText) {
}
