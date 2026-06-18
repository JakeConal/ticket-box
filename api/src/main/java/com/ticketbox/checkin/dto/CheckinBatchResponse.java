package com.ticketbox.checkin.dto;

import java.util.List;

public record CheckinBatchResponse(List<CheckinResultResponse> results) {
}
