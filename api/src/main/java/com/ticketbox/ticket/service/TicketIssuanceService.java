package com.ticketbox.ticket.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.auth.service.AuthenticatedUserService;
import com.ticketbox.ticket.dto.OrderTicketResponse;
import com.ticketbox.ticket.qr.QrTicketPayload;
import com.ticketbox.ticket.qr.QrTokenService;
import java.io.ByteArrayOutputStream;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TicketIssuanceService {

    private static final String PAID = "PAID";

    private final JdbcTemplate jdbcTemplate;
    private final QrTokenService qrTokenService;
    private final AuthenticatedUserService authenticatedUserService;

    public TicketIssuanceService(
            JdbcTemplate jdbcTemplate,
            QrTokenService qrTokenService,
            AuthenticatedUserService authenticatedUserService) {
        this.jdbcTemplate = jdbcTemplate;
        this.qrTokenService = qrTokenService;
        this.authenticatedUserService = authenticatedUserService;
    }

    @Transactional
    public void issueTicketsForPaidOrder(UUID orderId) {
        OrderSnapshot order = findOrder(orderId);
        if (!PAID.equals(order.status())) {
            return;
        }
        Integer existingTickets = jdbcTemplate.queryForObject(
                "select count(*) from tickets where order_id = ?",
                Integer.class,
                orderId);
        if (existingTickets != null && existingTickets > 0) {
            return;
        }
        List<OrderItemSnapshot> items = jdbcTemplate.query("""
                select oi.ticket_type_id, oi.quantity, tt.name as ticket_type, tt.zone
                from order_items oi
                join ticket_types tt on tt.id = oi.ticket_type_id
                where oi.order_id = ?
                order by oi.ticket_type_id
                """, (rs, rowNum) -> new OrderItemSnapshot(
                rs.getObject("ticket_type_id", UUID.class),
                rs.getInt("quantity"),
                rs.getString("ticket_type"),
                rs.getString("zone")), orderId);

        Instant issuedAt = Instant.now();
        for (OrderItemSnapshot item : items) {
            for (int i = 0; i < item.quantity(); i++) {
                UUID ticketId = UUID.randomUUID();
                String qrToken = qrTokenService.issue(new QrTicketPayload(
                        ticketId,
                        order.id(),
                        order.userId(),
                        order.concertId(),
                        item.ticketType(),
                        item.zone(),
                        issuedAt));
                jdbcTemplate.update("""
                        insert into tickets (id, order_id, ticket_type_id, user_id, qr_token, issued_at)
                        values (?, ?, ?, ?, ?, ?)
                        """,
                        ticketId,
                        order.id(),
                        item.ticketTypeId(),
                        order.userId(),
                        qrToken,
                        java.sql.Timestamp.from(issuedAt));
            }
        }
    }

    @Transactional
    public List<OrderTicketResponse> getOwnedOrderTickets(UUID orderId) {
        UserPrincipal user = authenticatedUserService.requireCurrentUser();
        OrderSnapshot order = findOrder(orderId);
        if (!order.userId().equals(user.id())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found");
        }
        if (!PAID.equals(order.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tickets are issued after payment is confirmed");
        }
        issueTicketsForPaidOrder(orderId);
        return jdbcTemplate.query("""
                select t.id,
                       t.order_id,
                       t.ticket_type_id,
                       tt.name as ticket_type,
                       tt.zone,
                       t.qr_token,
                       t.issued_at
                from tickets t
                join ticket_types tt on tt.id = t.ticket_type_id
                where t.order_id = ?
                  and t.user_id = ?
                order by t.issued_at, t.id
                """, (rs, rowNum) -> mapTicket(rs), orderId, user.id());
    }

    private OrderSnapshot findOrder(UUID orderId) {
        return jdbcTemplate.query("""
                select id, user_id, concert_id, status
                from orders
                where id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found");
            }
            return new OrderSnapshot(
                    rs.getObject("id", UUID.class),
                    rs.getObject("user_id", UUID.class),
                    rs.getObject("concert_id", UUID.class),
                    rs.getString("status"));
        }, orderId);
    }

    private OrderTicketResponse mapTicket(ResultSet rs) throws SQLException {
        String qrToken = rs.getString("qr_token");
        return new OrderTicketResponse(
                rs.getObject("id", UUID.class),
                rs.getObject("order_id", UUID.class),
                rs.getObject("ticket_type_id", UUID.class),
                rs.getString("ticket_type"),
                rs.getString("zone"),
                qrToken,
                qrPngBase64(qrToken),
                rs.getTimestamp("issued_at").toInstant());
    }

    private String qrPngBase64(String qrToken) {
        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(qrToken, BarcodeFormat.QR_CODE, 256, 256);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", output);
            return Base64.getEncoder().encodeToString(output.toByteArray());
        } catch (Exception ex) {
            throw new IllegalStateException("Could not render QR code", ex);
        }
    }

    private record OrderSnapshot(UUID id, UUID userId, UUID concertId, String status) {
    }

    private record OrderItemSnapshot(UUID ticketTypeId, int quantity, String ticketType, String zone) {
    }
}
