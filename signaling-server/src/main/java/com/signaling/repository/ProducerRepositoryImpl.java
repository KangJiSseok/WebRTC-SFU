package com.signaling.repository;

import com.querydsl.jpa.impl.JPAQueryFactory;
import com.signaling.model.QProducer;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class ProducerRepositoryImpl implements ProducerRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    public ProducerRepositoryImpl(JPAQueryFactory queryFactory) {
        this.queryFactory = queryFactory;
    }

    @Override
    public List<String> findProducerIdsByRoomId(String roomId) {
        QProducer producer = QProducer.producer;
        return queryFactory.select(producer.id)
                .from(producer)
                .where(producer.roomId.eq(roomId))
                .fetch();
    }
}
