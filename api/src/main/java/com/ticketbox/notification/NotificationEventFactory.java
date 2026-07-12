package com.ticketbox.notification;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import java.io.ByteArrayOutputStream;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class NotificationEventFactory {

    private final JdbcTemplate jdbcTemplate;

    public NotificationEventFactory(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public NotificationEvent purchaseConfirmation(UUID orderId) {
        OrderRecipient order = findOrderRecipient(orderId);
        List<NotificationEvent.Attachment> attachments = ticketAttachments(orderId);
        return new NotificationEvent(
                "PURCHASE_CONFIRMATION",
                order.userId(),
                order.email(),
                order.orderId(),
                order.concertId(),
                "TicketBox purchase confirmed: " + order.concertName(),
                "Your payment is confirmed. Your QR e-ticket(s) are attached and available in TicketBox.",
                "/orders/" + order.orderId() + "/tickets",
                attachments,
                Map.of(
                        "concertName", order.concertName(),
                        "eventDate", order.eventDate().toString(),
                        "ticketCount", attachments.size()));
    }

    public NotificationEvent inAppPurchaseConfirmation(UUID orderId) {
        OrderRecipient order = findOrderRecipient(orderId);
        return new NotificationEvent(
                "ORDER_PAID",
                order.userId(),
                order.email(),
                order.orderId(),
                order.concertId(),
                "Payment confirmed",
                "Your e-ticket for " + order.concertName() + " is ready.",
                "/orders/" + order.orderId() + "/tickets",
                List.of(),
                Map.of("concertName", order.concertName()));
    }

    public List<NotificationEvent> cancellationEvents(UUID concertId) {
        return jdbcTemplate.query("""
                select distinct o.id as order_id,
                       o.user_id,
                       u.email,
                       c.id as concert_id,
                       c.name as concert_name,
                       c.event_date
                from orders o
                join users u on u.id = o.user_id
                join concerts c on c.id = o.concert_id
                where o.concert_id = ?
                  and o.status = 'REFUND_REQUIRED'
                order by u.email
                """, (rs, rowNum) -> {
                    OrderRecipient order = mapOrderRecipient(rs);
                    return new NotificationEvent(
                            "CONCERT_CANCELLED",
                            order.userId(),
                            order.email(),
                            order.orderId(),
                            order.concertId(),
                            "Concert cancelled: " + order.concertName(),
                            "The concert has been cancelled. Your order is marked for manual refund.",
                            "/orders/" + order.orderId(),
                            List.of(),
                            Map.of(
                                    "concertName", order.concertName(),
                                    "eventDate", order.eventDate().toString()));
                }, concertId);
    }

    public List<NotificationEvent> reminderEvents(Instant windowStart, Instant windowEnd) {
        return jdbcTemplate.query("""
                select distinct o.id as order_id,
                       o.user_id,
                       u.email,
                       c.id as concert_id,
                       c.name as concert_name,
                       c.event_date
                from orders o
                join users u on u.id = o.user_id
                join concerts c on c.id = o.concert_id
                where o.status = 'PAID'
                  and c.status = 'PUBLISHED'
                  and o.reminder_sent_at is null
                  and c.event_date >= ?
                  and c.event_date < ?
                order by c.event_date, u.email
                """, (rs, rowNum) -> {
                    OrderRecipient order = mapOrderRecipient(rs);
                    return new NotificationEvent(
                            "PRE_EVENT_REMINDER",
                            order.userId(),
                            order.email(),
                            order.orderId(),
                            order.concertId(),
                            "Reminder: " + order.concertName() + " starts soon",
                            "Your concert starts in about 24 hours. Open your e-ticket before arriving at the gate.",
                            "/orders/" + order.orderId() + "/tickets",
                            List.of(),
                            Map.of(
                                    "concertName", order.concertName(),
                                    "eventDate", order.eventDate().toString()));
                }, Timestamp.from(windowStart), Timestamp.from(windowEnd));
    }

    private OrderRecipient findOrderRecipient(UUID orderId) {
        return jdbcTemplate.query("""
                select o.id as order_id,
                       o.user_id,
                       u.email,
                       c.id as concert_id,
                       c.name as concert_name,
                       c.event_date
                from orders o
                join users u on u.id = o.user_id
                join concerts c on c.id = o.concert_id
                where o.id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new IllegalArgumentException("Order not found: " + orderId);
            }
            return mapOrderRecipient(rs);
        }, orderId);
    }

    private List<NotificationEvent.Attachment> ticketAttachments(UUID orderId) {
        return jdbcTemplate.query("""
                select id,
                       qr_token
                from tickets
                where order_id = ?
                order by issued_at, id
                """, (rs, rowNum) -> new NotificationEvent.Attachment(
                "ticket-" + rs.getObject("id", UUID.class) + ".png",
                "image/png",
                qrPngBase64(rs.getString("qr_token"))), orderId);
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

    private OrderRecipient mapOrderRecipient(ResultSet rs) throws SQLException {
        return new OrderRecipient(
                rs.getObject("order_id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getString("email"),
                rs.getObject("concert_id", UUID.class),
                rs.getString("concert_name"),
                rs.getTimestamp("event_date").toInstant());
    }

    private record OrderRecipient(
            UUID orderId,
            UUID userId,
            String email,
            UUID concertId,
            String concertName,
            Instant eventDate) {
    }
}
