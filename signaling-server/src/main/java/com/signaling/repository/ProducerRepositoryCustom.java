package com.signaling.repository;

import java.util.List;

public interface ProducerRepositoryCustom {
    List<String> findProducerIdsByRoomId(String roomId);
}
