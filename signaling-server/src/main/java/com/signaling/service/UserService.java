package com.signaling.service;

import com.signaling.model.User;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/**
 * 사용자 엔티티를 인메모리로 관리하는 단순 서비스.
 */
@Service
public class UserService {

    private final Map<String, User> users = new ConcurrentHashMap<>();

    /**
     * 사용자를 저장소에 추가한다.
     */
    public User addUser(User user) {
        users.put(user.getId(), user);
        return user;
    }

    public Optional<User> getUser(String userId) {
        return Optional.ofNullable(users.get(userId));
    }

    /**
     * roomId에 속한 사용자 목록을 반환한다.
     */
    public List<User> getUsersByRoom(String roomId) {
        return users.values().stream()
                .filter(user -> roomId.equals(user.getRoomId()))
                .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
    }

    public void removeUser(String userId) {
        users.remove(userId);
    }

    /**
     * 방이 삭제될 때 해당 방의 사용자를 일괄 제거한다.
     */
    public void removeUsersByRoom(String roomId) {
        users.entrySet().removeIf(entry -> roomId.equals(entry.getValue().getRoomId()));
    }
}
