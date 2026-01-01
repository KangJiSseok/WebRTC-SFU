package com.signaling.domain.event.repository;

import com.querydsl.jpa.impl.JPAQueryFactory;
import com.signaling.domain.event.entity.QRoomEvent;
import com.signaling.domain.event.entity.RoomEvent;
import com.signaling.domain.event.entity.RoomEventType;
import java.time.Instant;
import java.util.List;
import com.querydsl.core.BooleanBuilder;
import org.springframework.stereotype.Repository;

@Repository
public class RoomEventRepositoryImpl implements RoomEventRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    public RoomEventRepositoryImpl(JPAQueryFactory queryFactory) {
        this.queryFactory = queryFactory;
    }

    @Override
    public List<RoomEvent> search(String roomId, Instant from, Instant to, List<RoomEventType> types,
            Instant cursorTime, Long cursorId, boolean forward, int limitPlusOne) {
        QRoomEvent event = QRoomEvent.roomEvent;
        var query = queryFactory.selectFrom(event);
        BooleanBuilder where = new BooleanBuilder(event.roomId.eq(roomId));

        if (from != null) {
            where.and(event.occurredAt.goe(from));
        }
        if (to != null) {
            where.and(event.occurredAt.loe(to));
        }
        if (types != null && !types.isEmpty()) {
            where.and(event.eventType.in(types));
        }
        if (cursorTime != null && cursorId != null) {
            if (forward) {
                where.and(
                        event.occurredAt.gt(cursorTime)
                                .or(event.occurredAt.eq(cursorTime).and(event.id.gt(cursorId)))
                );
            } else {
                where.and(
                        event.occurredAt.lt(cursorTime)
                                .or(event.occurredAt.eq(cursorTime).and(event.id.lt(cursorId)))
                );
            }
        }

        if (forward) {
            query.where(where).orderBy(event.occurredAt.asc(), event.id.asc());
        } else {
            query.where(where).orderBy(event.occurredAt.desc(), event.id.desc());
        }

        return query.limit(limitPlusOne)
                .fetch();
    }

    @Override
    public long count(String roomId, Instant from, Instant to, List<RoomEventType> types) {
        QRoomEvent event = QRoomEvent.roomEvent;
        var query = queryFactory.select(event.id.count())
                .from(event)
                .where(event.roomId.eq(roomId));

        if (from != null) {
            query.where(event.occurredAt.goe(from));
        }
        if (to != null) {
            query.where(event.occurredAt.loe(to));
        }
        if (types != null && !types.isEmpty()) {
            query.where(event.eventType.in(types));
        }

        Long result = query.fetchOne();
        return result == null ? 0L : result;
    }
}
