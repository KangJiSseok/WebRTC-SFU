package com.signaling.repository;

import com.signaling.model.Producer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProducerRepository extends JpaRepository<Producer, String>, ProducerRepositoryCustom {
    long deleteByRoomId(String roomId);
}
