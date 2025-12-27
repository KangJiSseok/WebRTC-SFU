package com.signaling.service;

import com.signaling.model.User;
import com.signaling.repository.UserRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사용자 엔티티를 인메모리로 관리하는 단순 서비스.
 */
@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * 사용자를 저장소에 추가한다.
     */
    public User addUser(User user) {
        return userRepository.save(user);
    }

    public Optional<User> getUser(String userId) {
        return userRepository.findById(userId);
    }

    /**
     * roomId에 속한 사용자 목록을 반환한다.
     */
    public List<User> getUsersByRoom(String roomId) {
        return userRepository.findByRoomId(roomId);
    }

    public long countUsersByRoom(String roomId) {
        return userRepository.countByRoomId(roomId);
    }

    @Transactional
    public void removeUser(String userId) {
        userRepository.deleteById(userId);
    }

    /**
     * 방이 삭제될 때 해당 방의 사용자를 일괄 제거한다.
     */
    @Transactional
    public void removeUsersByRoom(String roomId) {
        userRepository.deleteByRoomId(roomId);
    }
}
