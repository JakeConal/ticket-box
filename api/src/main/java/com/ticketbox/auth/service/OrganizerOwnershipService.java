package com.ticketbox.auth.service;

import com.ticketbox.auth.security.UserPrincipal;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OrganizerOwnershipService {

    private final JdbcTemplate jdbcTemplate;

    public OrganizerOwnershipService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void requireOwnedConcert(UUID concertId) {
        UserPrincipal principal = currentUser()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required"));
        if (!ownsConcert(principal.id(), concertId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Concert is not owned by this organizer");
        }
    }

    public boolean ownsConcert(UUID organizerId, UUID concertId) {
        Boolean owned = jdbcTemplate.queryForObject(
                "select exists(select 1 from concerts where id = ? and created_by = ?)",
                Boolean.class,
                concertId,
                organizerId);
        return Boolean.TRUE.equals(owned);
    }

    private Optional<UserPrincipal> currentUser() {
        Object principal = SecurityContextHolder.getContext().getAuthentication() == null
                ? null
                : SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return principal instanceof UserPrincipal userPrincipal
                ? Optional.of(userPrincipal)
                : Optional.empty();
    }
}
