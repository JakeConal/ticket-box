package com.ticketbox.aibio;

import com.ticketbox.aibio.dto.ArtistBioEditRequest;
import com.ticketbox.aibio.dto.ArtistBioRejectRequest;
import com.ticketbox.aibio.dto.ArtistBioResponse;
import com.ticketbox.aibio.dto.ArtistPdfUploadResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/admin/concerts/{concertId}")
public class ArtistBioController {

    private final ArtistBioService artistBioService;

    public ArtistBioController(ArtistBioService artistBioService) {
        this.artistBioService = artistBioService;
    }

    @PostMapping("/artist-pdf")
    @ResponseStatus(HttpStatus.ACCEPTED)
    ArtistPdfUploadResponse uploadPdf(
            @PathVariable UUID concertId,
            @RequestPart("file") MultipartFile file) {
        return artistBioService.uploadPressKit(concertId, file);
    }

    @GetMapping("/artist-bio")
    ArtistBioResponse review(@PathVariable UUID concertId) {
        return artistBioService.getReview(concertId);
    }

    @PutMapping("/artist-bio")
    ArtistBioResponse edit(
            @PathVariable UUID concertId,
            @Valid @RequestBody ArtistBioEditRequest request) {
        return artistBioService.editDraft(concertId, request);
    }

    @PostMapping("/artist-bio/publish")
    ArtistBioResponse publish(@PathVariable UUID concertId) {
        return artistBioService.publish(concertId);
    }

    @PostMapping("/artist-bio/reject")
    ArtistBioResponse reject(
            @PathVariable UUID concertId,
            @RequestBody(required = false) ArtistBioRejectRequest request) {
        return artistBioService.reject(concertId, request);
    }
}
