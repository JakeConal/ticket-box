package com.ticketbox.checkin.controller;

import com.ticketbox.checkin.dto.CheckinConflictResponse;
import com.ticketbox.checkin.service.CheckinConflictService;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/concerts/{concertId}/checkin-conflicts")
public class AdminCheckinConflictController {

    private final CheckinConflictService checkinConflictService;

    public AdminCheckinConflictController(CheckinConflictService checkinConflictService) {
        this.checkinConflictService = checkinConflictService;
    }

    @GetMapping
    List<CheckinConflictResponse> list(@PathVariable UUID concertId) {
        return checkinConflictService.listForConcert(concertId);
    }
}
