package com.signaling.repository;

import com.signaling.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, String>, UserRepositoryCustom {
    long deleteByRoomId(String roomId);
}
