---
layout: page
title: cppx 유지보수
description: cppx 유지보수 정보
---

<script setup>
import {
  VPTeamPage,
  VPTeamMembers
} from 'vitepress/theme'

const developer = [
  {
    avatar: 'https://avatars.githubusercontent.com/u/110483588?v=4',
    name: '안동민',
    title: '개발 및 유지보수',
    desc: 'cppx의 개발과 유지보수를 담당합니다.',
    links: [
      { icon: 'github', link: 'https://github.com/andongmin94' },
    ]
  }
]
</script>

<VPTeamPage>
  <VPTeamMembers :members="developer" />
</VPTeamPage>

## 릴리스 체크리스트

- `cd packages && npm run typecheck`
- `cd packages && npm run test:ci`
- `cd packages && npm run build`
- `cd docs && npm run docs-build`
- GitHub Actions `Native CI`가 Windows, macOS, Linux에서 모두 초록인지 확인

## 현재 아티팩트 기준

- 앱 빌드 산출물: `packages/out`
- 문서 사이트 산출물: `docs/.vitepress/dist`
- GitHub Actions는 각 OS별 앱 빌드 산출물을 업로드하고, Linux docs job에서 문서 사이트 산출물도 업로드합니다.

## 현재 릴리스 범위

- 네이티브 호스트 워크플로는 Windows, macOS, Linux를 기준으로 검증합니다.
- Windows는 관리형 도구 설치와 MSVC system 감지를 모두 포함합니다.
- macOS와 Linux는 system 도구 기반 워크플로를 기준으로 문서와 CI를 맞춥니다.
- 서명된 설치 관리자나 별도 배포 채널 자동화는 아직 이 저장소의 범위 밖입니다.
