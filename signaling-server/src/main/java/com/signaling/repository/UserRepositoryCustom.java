package com.signaling.repository;

import com.signaling.model.User;
import java.util.List;

public interface UserRepositoryCustom {
    List<User> findByRoomId(String roomId);
    long countByRoomId(String roomId);
}
