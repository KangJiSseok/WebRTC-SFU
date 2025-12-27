package com.signaling.service;

import com.signaling.model.Producer;
import com.signaling.repository.ProducerRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProducerService {

    private final ProducerRepository producerRepository;

    public ProducerService(ProducerRepository producerRepository) {
        this.producerRepository = producerRepository;
    }

    @Transactional
    public Producer addProducer(String roomId, String producerId, String userId, String kind) {
        Producer producer = new Producer(producerId, roomId, userId, kind, Instant.now());
        return producerRepository.save(producer);
    }

    public List<String> getProducerIdsByRoom(String roomId) {
        return producerRepository.findProducerIdsByRoomId(roomId);
    }

    @Transactional
    public void removeProducer(String producerId) {
        producerRepository.deleteById(producerId);
    }

    @Transactional
    public void removeProducersByRoom(String roomId) {
        producerRepository.deleteByRoomId(roomId);
    }
}
