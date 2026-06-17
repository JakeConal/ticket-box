CREATE INDEX idx_orders_user_id_concert_id ON orders(user_id, concert_id);

CREATE UNIQUE INDEX ux_tickets_qr_token ON tickets(qr_token);

CREATE INDEX idx_order_items_order_id_ticket_type_id ON order_items(order_id, ticket_type_id);

CREATE UNIQUE INDEX ux_vip_guests_concert_id_phone_normalized
    ON vip_guests(concert_id, phone_normalized);
