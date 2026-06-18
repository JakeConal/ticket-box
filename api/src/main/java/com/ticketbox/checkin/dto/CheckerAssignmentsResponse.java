package com.ticketbox.checkin.dto;

import java.util.List;
import java.util.UUID;

public record CheckerAssignmentsResponse(
        UUID concertId,
        UUID checkerId,
        List<CheckerAssignmentResponse> assignments) {
}
