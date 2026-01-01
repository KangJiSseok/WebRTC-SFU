package com.signaling.domain.member.service;

import com.signaling.domain.member.dto.MemberResponse;
import com.signaling.domain.member.dto.MemberSignupRequest;
import com.signaling.domain.member.entity.Member;
import com.signaling.domain.member.entity.MemberRole;
import com.signaling.domain.member.repository.MemberRepository;
import java.time.Instant;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class MemberService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    public MemberService(MemberRepository memberRepository, PasswordEncoder passwordEncoder) {
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public MemberResponse signup(MemberSignupRequest request) {
        if (memberRepository.existsByUsername(request.getUsername())) {
            throw new IllegalArgumentException("Username already exists");
        }
        MemberRole role = MemberRole.VIEWER;
        String hash = passwordEncoder.encode(request.getPassword());
        Member member = new Member(request.getUsername(), hash, role, Instant.now());
        Member saved = memberRepository.save(member);
        return toResponse(saved);
    }

    private MemberResponse toResponse(Member member) {
        MemberResponse response = new MemberResponse();
        response.setId(member.getId());
        response.setUsername(member.getUsername());
        response.setRole(member.getRole().name());
        response.setCreatedAt(member.getCreatedAt());
        return response;
    }
}
