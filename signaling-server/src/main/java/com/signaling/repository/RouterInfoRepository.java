package com.signaling.repository;

import com.signaling.model.RouterInfo;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RouterInfoRepository extends JpaRepository<RouterInfo, String> {
}
