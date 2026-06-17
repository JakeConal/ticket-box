package com.ticketbox.ticket.service;

import com.ticketbox.auth.security.UserPrincipal;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class QueueAdmissionService {

    public void requireAdmissionIfActive(UUID concertId, UserPrincipal user, String admissionToken) {
        if (!isQueueActive(concertId)) {
            return;
        }
        if (admissionToken == null || admissionToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Waiting queue admission token is required");
        }
    }

    private boolean isQueueActive(UUID concertId) {
        return false;
    }
}
