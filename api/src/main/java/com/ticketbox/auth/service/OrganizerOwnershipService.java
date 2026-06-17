package com.ticketbox.auth.service;

import com.ticketbox.auth.security.UserPrincipal;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OrganizerOwnershipService {

    private final JdbcTemplate jdbcTemplate;
    private final AuthenticatedUserService authenticatedUserService;

    public OrganizerOwnershipService(JdbcTemplate jdbcTemplate, AuthenticatedUserService authenticatedUserService) {
        this.jdbcTemplate = jdbcTemplate;
        this.authenticatedUserService = authenticatedUserService;
    }

    public void requireOwnedConcert(UUID concertId) {
        UserPrincipal principal = authenticatedUserService.requireCurrentUser();
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
}
