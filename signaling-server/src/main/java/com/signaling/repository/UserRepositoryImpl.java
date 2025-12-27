package com.signaling.repository;

import com.querydsl.jpa.impl.JPAQueryFactory;
import com.signaling.model.QUser;
import com.signaling.model.User;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepositoryImpl implements UserRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    public UserRepositoryImpl(JPAQueryFactory queryFactory) {
        this.queryFactory = queryFactory;
    }

    @Override
    public List<User> findByRoomId(String roomId) {
        QUser user = QUser.user;
        return queryFactory.selectFrom(user)
                .where(user.roomId.eq(roomId))
                .fetch();
    }

    @Override
    public long countByRoomId(String roomId) {
        QUser user = QUser.user;
        Long count = queryFactory.select(user.id.count())
                .from(user)
                .where(user.roomId.eq(roomId))
                .fetchOne();
        return count == null ? 0L : count;
    }
}
