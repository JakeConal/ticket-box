package com.ticketbox.auth.repository;

import com.ticketbox.auth.model.User;
import com.ticketbox.auth.model.UserRole;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    boolean existsByEmailIgnoreCase(String email);

    Optional<User> findByEmailIgnoreCase(String email);

    List<User> findAllByRoleOrderByCreatedAtDesc(UserRole role);
}
