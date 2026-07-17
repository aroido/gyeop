# GYEOP HTTP boundary 운영 계약

이 directory의 파일은 staging/production host에 수동 복사하는 완성 설정이 아니라, root 운영 경로가 inventory를 검증한 뒤 설치하는 기준 artifact다.

1. 환경별 app UID·port·hostname과 shared HAProxy UID를 JSON inventory에 기록한다.
2. `node scripts/render-http-boundary-ops.mjs nftables <inventory>` 출력은 root-owned `0640` `/etc/gyeop/http-boundary.nft`로 설치한다.
3. 환경별 HAProxy backend 출력은 외부 forwarding header를 지운 뒤 canonical 다섯 header를 쓰는 순서를 유지한다. `haproxy-origin-wrapper`는 root-owned `0640` 전용 credential file에서 첫 reader만 writer로 export하고 값을 command line이나 log에 넣지 않는다.
4. restore script와 probe는 root-owned `0755`, unit/drop-in은 root-owned `0644`로 설치한다. app은 `gyeop-http-boundary@<env>.target`을 통해서만 boot target에 연결한다.
5. credential 회전은 app secondary 추가·재시작 → credential 순서를 `new.old`로 바꾸고 HAProxy reload → new smoke → old 제거·app 재시작 → old 거절/new 정상 smoke 순서다. 마지막 app 재시작 전 실패는 old writer로, 이후 실패는 old/new reader를 함께 복구한다.
6. 방화벽 probe 실패 시 app 공개를 중단하고 직전 root-owned ruleset과 unit을 복구한다. 모든 local UID에 app port를 여는 임시 rollback은 금지한다.

실제 설치 전 `scripts/verify-http-boundary.mjs`와 `tests/integration/http-boundary-host.test.sh`를 실행한다. 두 번째 container boot까지 통과하지 않은 artifact는 배포하지 않는다.
