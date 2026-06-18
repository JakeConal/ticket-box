package com.ticketbox.concert.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Entity
@Table(name = "concerts")
public class Concert {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(nullable = false)
    private String venue;

    @Column(name = "event_date", nullable = false)
    private Instant eventDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ConcertStatus status;

    @Column(name = "event_code", nullable = false, unique = true)
    private String eventCode;

    @Column(name = "artist_bio")
    private String artistBio;

    @Column(name = "artist_bio_draft")
    private String artistBioDraft;

    @Enumerated(EnumType.STRING)
    @Column(name = "bio_status")
    private BioStatus bioStatus;

    @Column(name = "bio_error")
    private String bioError;

    @Column(name = "bio_generation_id", nullable = false)
    private long bioGenerationId;

    @Column(name = "artist_pdf_uri")
    private String artistPdfUri;

    @Column(name = "seat_map_svg")
    private String seatMapSvg;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "concert", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("price ASC")
    private List<TicketType> ticketTypes = new ArrayList<>();

    protected Concert() {
    }

    public Concert(
            UUID id,
            String name,
            String description,
            String venue,
            Instant eventDate,
            String eventCode,
            String artistBio,
            String seatMapSvg,
            UUID createdBy,
            Instant createdAt) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.venue = venue;
        this.eventDate = eventDate;
        this.eventCode = eventCode;
        this.artistBio = artistBio;
        this.seatMapSvg = seatMapSvg;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
        this.status = ConcertStatus.DRAFT;
        this.bioGenerationId = 0L;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public String getVenue() {
        return venue;
    }

    public Instant getEventDate() {
        return eventDate;
    }

    public ConcertStatus getStatus() {
        return status;
    }

    public String getEventCode() {
        return eventCode;
    }

    public String getArtistBio() {
        return artistBio;
    }

    public String getArtistBioDraft() {
        return artistBioDraft;
    }

    public BioStatus getBioStatus() {
        return bioStatus;
    }

    public String getBioError() {
        return bioError;
    }

    public long getBioGenerationId() {
        return bioGenerationId;
    }

    public String getArtistPdfUri() {
        return artistPdfUri;
    }

    public String getSeatMapSvg() {
        return seatMapSvg;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public List<TicketType> getTicketTypes() {
        return ticketTypes;
    }

    public void updateMetadata(
            String name,
            String description,
            String venue,
            Instant eventDate,
            String eventCode,
            String artistBio,
            String seatMapSvg,
            Instant updatedAt) {
        this.name = name;
        this.description = description;
        this.venue = venue;
        this.eventDate = eventDate;
        this.eventCode = eventCode;
        this.artistBio = artistBio;
        this.seatMapSvg = seatMapSvg;
        this.updatedAt = updatedAt;
    }

    public void publish(Instant updatedAt) {
        this.status = ConcertStatus.PUBLISHED;
        this.updatedAt = updatedAt;
    }

    public void cancel(Instant updatedAt) {
        this.status = ConcertStatus.CANCELLED;
        this.updatedAt = updatedAt;
    }

    public void startBioGeneration(String artistPdfUri, long generationId, Instant updatedAt) {
        this.artistPdfUri = artistPdfUri;
        this.bioGenerationId = generationId;
        this.artistBioDraft = null;
        this.bioError = null;
        this.bioStatus = BioStatus.GENERATING;
        this.updatedAt = updatedAt;
    }

    public boolean saveBioDraftIfCurrent(long generationId, String draft, Instant updatedAt) {
        if (this.bioGenerationId != generationId || this.bioStatus != BioStatus.GENERATING) {
            return false;
        }
        this.artistBioDraft = draft;
        this.bioError = null;
        this.bioStatus = BioStatus.DRAFT;
        this.updatedAt = updatedAt;
        return true;
    }

    public boolean failBioIfCurrent(long generationId, String error, Instant updatedAt) {
        if (this.bioGenerationId != generationId || this.bioStatus != BioStatus.GENERATING) {
            return false;
        }
        this.bioError = error;
        this.bioStatus = BioStatus.FAILED;
        this.updatedAt = updatedAt;
        return true;
    }

    public void editBioDraft(String draftText, Instant updatedAt) {
        if (!StringUtils.hasText(draftText)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Artist bio draft is required");
        }
        this.artistBioDraft = draftText;
        this.bioError = null;
        this.bioStatus = BioStatus.DRAFT;
        this.updatedAt = updatedAt;
    }

    public void publishBio(Instant updatedAt) {
        if (!StringUtils.hasText(artistBioDraft)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No artist bio draft is available to publish");
        }
        this.artistBio = artistBioDraft;
        this.artistBioDraft = null;
        this.bioError = null;
        this.bioStatus = BioStatus.PUBLISHED;
        this.updatedAt = updatedAt;
    }

    public void rejectBio(String reason, Instant updatedAt) {
        this.artistBioDraft = null;
        this.bioError = StringUtils.hasText(reason) ? reason.trim() : null;
        this.bioStatus = BioStatus.REJECTED;
        this.updatedAt = updatedAt;
    }
}
