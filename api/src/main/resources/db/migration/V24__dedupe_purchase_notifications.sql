CREATE UNIQUE INDEX ux_notification_outbox_purchase_confirmation
    ON notification_outbox(order_id, event_type)
    WHERE event_type = 'PURCHASE_CONFIRMATION';
