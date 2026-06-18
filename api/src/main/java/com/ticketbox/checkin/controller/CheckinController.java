package com.ticketbox.checkin.controller;

import com.ticketbox.checkin.dto.CheckinBatchRequest;
import com.ticketbox.checkin.dto.CheckinBatchResponse;
import com.ticketbox.checkin.dto.CheckinRequest;
import com.ticketbox.checkin.dto.CheckinResultResponse;
import com.ticketbox.checkin.service.CheckinService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/checkins")
public class CheckinController {

    private final CheckinService checkinService;

    public CheckinController(CheckinService checkinService) {
        this.checkinService = checkinService;
    }

    @PostMapping("/{ticketId}")
    ResponseEntity<CheckinResultResponse> checkIn(
            @PathVariable UUID ticketId,
            @Valid @RequestBody CheckinRequest request) {
        CheckinResultResponse result = checkinService.checkIn(ticketId, request);
        HttpStatus status = "CONFLICT".equals(result.result()) ? HttpStatus.CONFLICT : HttpStatus.OK;
        return ResponseEntity.status(status).body(result);
    }

    @PostMapping("/batch")
    CheckinBatchResponse checkInBatch(@Valid @RequestBody CheckinBatchRequest request) {
        return checkinService.checkInBatch(request);
    }
}
