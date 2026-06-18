package com.ticketbox.concert.service;

import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.auth.service.AuthenticatedUserService;
import com.ticketbox.auth.service.OrganizerOwnershipService;
import com.ticketbox.concert.cache.ConcertCacheService;
import com.ticketbox.concert.dto.ConcertDetailResponse;
import com.ticketbox.concert.dto.ConcertPageResponse;
import com.ticketbox.concert.dto.ConcertRequest;
import com.ticketbox.concert.dto.ConcertStatsResponse;
import com.ticketbox.concert.dto.ConcertSummaryResponse;
import com.ticketbox.concert.dto.TicketAvailabilityResponse;
import com.ticketbox.concert.dto.TicketTypeRequest;
import com.ticketbox.concert.dto.TicketTypeResponse;
import com.ticketbox.concert.event.ConcertCancelledEvent;
import com.ticketbox.concert.model.Concert;
import com.ticketbox.concert.model.ConcertStatus;
import com.ticketbox.concert.model.TicketType;
import com.ticketbox.concert.repository.ConcertRepository;
import com.ticketbox.concert.repository.TicketTypeRepository;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ConcertService {

    private final ConcertRepository concertRepository;
    private final TicketTypeRepository ticketTypeRepository;
    private final ConcertCacheService concertCacheService;
    private final AuthenticatedUserService authenticatedUserService;
    private final OrganizerOwnershipService organizerOwnershipService;
    private final JdbcTemplate jdbcTemplate;
    private final ApplicationEventPublisher eventPublisher;

    public ConcertService(
            ConcertRepository concertRepository,
            TicketTypeRepository ticketTypeRepository,
            ConcertCacheService concertCacheService,
            AuthenticatedUserService authenticatedUserService,
            OrganizerOwnershipService organizerOwnershipService,
            JdbcTemplate jdbcTemplate,
            ApplicationEventPublisher eventPublisher) {
        this.concertRepository = concertRepository;
        this.ticketTypeRepository = ticketTypeRepository;
        this.concertCacheService = concertCacheService;
        this.authenticatedUserService = authenticatedUserService;
        this.organizerOwnershipService = organizerOwnershipService;
        this.jdbcTemplate = jdbcTemplate;
        this.eventPublisher = eventPublisher;
    }

    @Transactional(readOnly = true)
    public ConcertPageResponse listPublished(int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 100);
        return concertCacheService.getListing(safePage, safeSize, () -> {
            Page<Concert> concerts = concertRepository.findByStatusOrderByEventDateAsc(
                    ConcertStatus.PUBLISHED,
                    PageRequest.of(safePage, safeSize));
            return new ConcertPageResponse(
                    concerts.getContent().stream().map(ConcertSummaryResponse::from).toList(),
                    safePage,
                    safeSize,
                    concerts.getTotalElements(),
                    concerts.getTotalPages());
        });
    }

    @Transactional(readOnly = true)
    public List<ConcertSummaryResponse> listOwned() {
        UserPrincipal organizer = authenticatedUserService.requireCurrentUser();
        return concertRepository.findByCreatedByOrderByEventDateAsc(organizer.id())
                .stream()
                .map(ConcertSummaryResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ConcertDetailResponse getPublicDetail(UUID concertId) {
        return concertCacheService.getDetail(
                concertId,
                () -> loadDetail(concertId),
                response -> response.status() == ConcertStatus.PUBLISHED);
    }

    @Transactional
    public ConcertDetailResponse createConcert(ConcertRequest request) {
        UserPrincipal organizer = authenticatedUserService.requireCurrentUser();
        Concert concert = new Concert(
                UUID.randomUUID(),
                request.name().trim(),
                request.description(),
                request.venue().trim(),
                request.eventDate(),
                request.eventCode().trim(),
                request.artistBio(),
                request.seatMapSvg(),
                organizer.id(),
                Instant.now());
        Concert saved = concertRepository.save(concert);
        invalidateConcertAndListings(saved.getId());
        return ConcertDetailResponse.from(saved);
    }

    @Transactional
    public ConcertDetailResponse updateConcert(UUID concertId, ConcertRequest request) {
        Concert concert = requireOwnedConcertEntity(concertId);
        if (concert.getEventDate().isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Past concerts cannot be updated");
        }
        concert.updateMetadata(
                request.name().trim(),
                request.description(),
                request.venue().trim(),
                request.eventDate(),
                request.eventCode().trim(),
                request.artistBio(),
                request.seatMapSvg(),
                Instant.now());
        invalidateConcertAndListings(concert.getId());
        return ConcertDetailResponse.from(concert);
    }

    @Transactional
    public void cancelConcert(UUID concertId) {
        Concert concert = requireOwnedConcertEntity(concertId);
        if (concert.getStatus() == ConcertStatus.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Concert is already cancelled");
        }
        concert.cancel(Instant.now());
        jdbcTemplate.update("""
                update orders
                set status = 'REFUND_REQUIRED',
                    refund_reason = coalesce(refund_reason, 'Concert cancelled')
                where concert_id = ?
                  and status = 'PAID'
        """, concertId);
        invalidateConcertAndListings(concertId);
        eventPublisher.publishEvent(new ConcertCancelledEvent(concertId));
    }

    @Transactional
    public TicketTypeResponse createTicketType(UUID concertId, TicketTypeRequest request) {
        Concert concert = requireOwnedConcertEntity(concertId);
        validateTicketType(request, request.totalQuantity());
        TicketType ticketType = new TicketType(
                UUID.randomUUID(),
                concert,
                request.name().trim(),
                request.zone().trim(),
                request.price(),
                request.totalQuantity(),
                request.saleOpensAt(),
                request.perUserLimit(),
                Instant.now());
        TicketType saved = ticketTypeRepository.save(ticketType);
        invalidateConcert(concertId);
        return TicketTypeResponse.from(saved);
    }

    @Transactional
    public TicketTypeResponse updateTicketType(UUID concertId, UUID ticketTypeId, TicketTypeRequest request) {
        requireOwnedConcertEntity(concertId);
        TicketType ticketType = ticketTypeRepository.findById(ticketTypeId)
                .filter(type -> type.getConcert().getId().equals(concertId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket type not found"));
        int remainingQuantity = request.remainingQuantity() == null
                ? ticketType.getRemainingQuantity()
                : request.remainingQuantity();
        validateTicketType(request, remainingQuantity);
        boolean remainingChanged = remainingQuantity != ticketType.getRemainingQuantity();
        ticketType.update(
                request.name().trim(),
                request.zone().trim(),
                request.price(),
                request.totalQuantity(),
                remainingQuantity,
                request.saleOpensAt(),
                request.perUserLimit());
        invalidateConcert(concertId);
        if (remainingChanged) {
            concertCacheService.invalidateTicketAvailability(ticketTypeId);
        }
        return TicketTypeResponse.from(ticketType);
    }

    @Transactional(readOnly = true)
    public ConcertStatsResponse getStats(UUID concertId) {
        organizerOwnershipService.requireOwnedConcert(concertId);
        BigDecimal revenue = jdbcTemplate.queryForObject("""
                select coalesce(sum(tt.price * oi.quantity), 0)
                from orders o
                join order_items oi on oi.order_id = o.id
                join ticket_types tt on tt.id = oi.ticket_type_id
                where o.concert_id = ?
                  and o.status = 'PAID'
                """, BigDecimal.class, concertId);
        Long checkins = jdbcTemplate.queryForObject("""
                select count(*)
                from checkins c
                join tickets t on t.id = c.ticket_id
                join ticket_types tt on tt.id = t.ticket_type_id
                where tt.concert_id = ?
                """, Long.class, concertId);
        List<ConcertStatsResponse.TicketTypeSales> sales = jdbcTemplate.query("""
                select tt.id, tt.name, tt.zone, coalesce(sum(oi.quantity), 0) as sold_quantity
                from ticket_types tt
                left join order_items oi on oi.ticket_type_id = tt.id
                left join orders o on o.id = oi.order_id and o.status = 'PAID'
                where tt.concert_id = ?
                group by tt.id, tt.name, tt.zone
                order by tt.price asc
                """, this::mapTicketTypeSales, concertId);
        return new ConcertStatsResponse(
                revenue == null ? BigDecimal.ZERO : revenue,
                checkins == null ? 0L : checkins,
                sales);
    }

    @Transactional
    public ConcertDetailResponse publish(UUID concertId) {
        Concert concert = requireOwnedConcertEntity(concertId);
        if (concert.getStatus() != ConcertStatus.DRAFT) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only draft concerts can be published");
        }
        if (!hasRequiredMetadata(concert)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Concert metadata is incomplete");
        }
        if (ticketTypeRepository.countByConcertId(concertId) == 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Concert requires at least one ticket type");
        }
        concert.publish(Instant.now());
        invalidateConcertAndListings(concertId);
        return ConcertDetailResponse.from(concertRepository.findById(concertId).orElseThrow());
    }

    @Transactional(readOnly = true)
    public List<TicketAvailabilityResponse> getAvailability(UUID concertId) {
        Concert concert = concertRepository.findById(concertId)
                .filter(found -> found.getStatus() == ConcertStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Concert not found"));
        return ticketTypeRepository.findByConcertIdOrderByPriceAsc(concert.getId())
                .stream()
                .map(this::getTicketAvailability)
                .toList();
    }

    private ConcertDetailResponse loadDetail(UUID concertId) {
        Concert concert = concertRepository.findById(concertId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Concert not found"));
        if (concert.getStatus() != ConcertStatus.PUBLISHED && !isOwnedByCurrentUser(concert)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Concert not found");
        }
        return ConcertDetailResponse.from(concert);
    }

    private Concert requireOwnedConcertEntity(UUID concertId) {
        UserPrincipal organizer = authenticatedUserService.requireCurrentUser();
        Concert concert = concertRepository.findById(concertId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Concert not found"));
        if (!concert.getCreatedBy().equals(organizer.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Concert is not owned by this organizer");
        }
        return concert;
    }

    private boolean isOwnedByCurrentUser(Concert concert) {
        return authenticatedUserService.currentUser()
                .map(user -> concert.getCreatedBy().equals(user.id()))
                .orElse(false);
    }

    private void validateTicketType(TicketTypeRequest request, int remainingQuantity) {
        if (request.perUserLimit() > request.totalQuantity()) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "Per-user limit cannot exceed total quantity");
        }
        if (remainingQuantity < 0 || remainingQuantity > request.totalQuantity()) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "Remaining quantity must be between zero and total quantity");
        }
    }

    private TicketAvailabilityResponse getTicketAvailability(TicketType ticketType) {
        return concertCacheService.getAvailability(ticketType.getId(), () -> new TicketAvailabilityResponse(
                ticketType.getId(),
                ticketType.getName(),
                ticketType.getZone(),
                ticketType.getRemainingQuantity(),
                ticketType.getRemainingQuantity() == 0));
    }

    private ConcertStatsResponse.TicketTypeSales mapTicketTypeSales(ResultSet rs, int rowNum) throws SQLException {
        return new ConcertStatsResponse.TicketTypeSales(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getString("zone"),
                rs.getLong("sold_quantity"));
    }

    private boolean hasRequiredMetadata(Concert concert) {
        return StringUtils.hasText(concert.getName())
                && StringUtils.hasText(concert.getVenue())
                && StringUtils.hasText(concert.getEventCode())
                && StringUtils.hasText(concert.getSeatMapSvg())
                && concert.getEventDate() != null
                && concert.getEventDate().isAfter(Instant.now());
    }

    private void invalidateConcert(UUID concertId) {
        concertCacheService.invalidateConcert(concertId);
    }

    private void invalidateConcertAndListings(UUID concertId) {
        concertCacheService.invalidateConcertAndListings(concertId);
    }
}
