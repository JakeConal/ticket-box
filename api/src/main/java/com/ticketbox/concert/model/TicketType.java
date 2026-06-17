package com.ticketbox.concert.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ticket_types")
public class TicketType {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "concert_id", nullable = false)
    private Concert concert;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String zone;

    @Column(nullable = false)
    private BigDecimal price;

    @Column(name = "total_quantity", nullable = false)
    private int totalQuantity;

    @Column(name = "remaining_quantity", nullable = false)
    private int remainingQuantity;

    @Column(name = "sale_opens_at", nullable = false)
    private Instant saleOpensAt;

    @Column(name = "per_user_limit", nullable = false)
    private int perUserLimit;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected TicketType() {
    }

    public TicketType(
            UUID id,
            Concert concert,
            String name,
            String zone,
            BigDecimal price,
            int totalQuantity,
            Instant saleOpensAt,
            int perUserLimit,
            Instant createdAt) {
        this.id = id;
        this.concert = concert;
        this.name = name;
        this.zone = zone;
        this.price = price;
        this.totalQuantity = totalQuantity;
        this.remainingQuantity = totalQuantity;
        this.saleOpensAt = saleOpensAt;
        this.perUserLimit = perUserLimit;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public Concert getConcert() {
        return concert;
    }

    public String getName() {
        return name;
    }

    public String getZone() {
        return zone;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public int getTotalQuantity() {
        return totalQuantity;
    }

    public int getRemainingQuantity() {
        return remainingQuantity;
    }

    public Instant getSaleOpensAt() {
        return saleOpensAt;
    }

    public int getPerUserLimit() {
        return perUserLimit;
    }

    public void update(
            String name,
            String zone,
            BigDecimal price,
            int totalQuantity,
            int remainingQuantity,
            Instant saleOpensAt,
            int perUserLimit) {
        this.name = name;
        this.zone = zone;
        this.price = price;
        this.totalQuantity = totalQuantity;
        this.remainingQuantity = remainingQuantity;
        this.saleOpensAt = saleOpensAt;
        this.perUserLimit = perUserLimit;
    }
}
