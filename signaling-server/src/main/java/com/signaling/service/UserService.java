package com.signaling.service;

import com.signaling.model.User;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    private final Map<String, User> users = new ConcurrentHashMap<>();

    public User addUser(User user) {
        users.put(user.getId(), user);
        return user;
    }

    public Optional<User> getUser(String userId) {
        return Optional.ofNullable(users.get(userId));
    }

    public List<User> getUsersByRoom(String roomId) {
        return users.values().stream()
                .filter(user -> roomId.equals(user.getRoomId()))
                .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
    }

    public void removeUser(String userId) {
        users.remove(userId);
    }

    public void removeUsersByRoom(String roomId) {
        users.entrySet().removeIf(entry -> roomId.equals(entry.getValue().getRoomId()));
    }
}
