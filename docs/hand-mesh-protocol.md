# Desktop hand mesh sidecar protocol v1

Only a panel-managed desktop run with Hand starts one selected mesh sidecar. It is optional: acquisition and interaction never wait for ready or results. Settings are pinned at launch; changing them or selecting None takes effect next run. Other execution contexts get no endpoint. No program, environment or model is installed or downloaded by this protocol.

## Ownership and lifecycle

The panel starts the contained program directly, with the declared argument array and no shell. Its cwd is the program's directory. Native launch metadata has an optional `handMeshRuntimeJson` with `{version:1,url,token}`; the URL is an ephemeral `http://127.0.0.1:<port>` service and the token is run-owned. This is not part of a portable Hands profile or package. Existing hosts/bundles without this feature remain skeleton-only and show rebuild/relaunch guidance in mesh status. Host input is never gated on it.

The child communicates only over private stdin/stdout pipes, not the renderer's credential. Stderr is drained without forwarding untrusted logs. It MUST exit when stdin closes, including owner crash; subprocesses it owns must do the same. Ready timeout is 10 seconds. Stop sends `stop` and EOF, waits two seconds, then terminates the owned child; failed termination is reported. Host exit, run rollback, page disposal and panel shutdown retire requests/credentials. A failed processor is not automatically restarted; the next run retries.

## Private pipe packets

All packets have a 12-byte little-endian header: uint32 magic `0x314d5258`, uint32 JSON-control byte length, uint32 binary-payload byte length. UTF-8 JSON follows, then packed little-endian numeric buffers. Control is at most 16 KiB; a whole packet is at most 2 MiB. Stdout contains packets only, no logging. `packages/sdk/src/hand-mesh-protocol.ts` is the reference codec.

- `start`: `{type:"start",version:1,owner,id,settingsVersion,settings,limits,ownerLoss:"exit-on-stdin-end"}`. Validate installed runtime/assets offline; never fetch them implicitly.
- `ready`: `{type:"ready",version:1}` after compatible initialization. A ready child is not proof an app is drawing meshes.
- `frame`: `{type:"frame",epoch,sequence,revision,sentMs,sampleMs,hands:[{id,handedness,keypoints}]}`. At most two hands, each with 21 finite XYZ positions in panel metres. These are copies of the final SDK sampled/adjusted/filtered/predicted pose, not raw acquisition. Handedness is left/right/unknown; a plugin may omit unsupported hands. `sentMs` and `sampleMs` are renderer-clock values, not the child clock. Reset internal state when epoch/revision or a hand identity changes. Do not apply another global size/offset or extra source filtering.
- `result`: echoes `epoch,sequence,revision` and has `meshes:[{id,topology,vertices,normals,indices}]`. Each descriptor's payload is positions (vertices × 3 float32), optional normals (same length), then uint32 indices. Normals is a boolean; indices is an index count divisible by three. Topology is a bounded stable ID/version string. At most 16,384 vertices and 32,768 triangles per hand; all values must be finite and indices within the vertex count. An index count of zero reuses the client's cached matching topology; send full indices on first use/new epoch. No replacement joints or executable draw callback is accepted.
- `stop`: `{type:"stop"}` followed by pipe EOF; dispose and exit. Exit/error/invalid output becomes a classified skeleton-fallback status.

Two mid-detail hands (2,859 vertices and 5,692 triangles each) with positions, normals and full indices are approximately 274 KiB plus the small control header, comfortably under the packet cap. This describes capacity, not a model-performance guarantee.

## Renderer loopback endpoint

The SDK connects once with authenticated `POST /connect`, then sends frames with `POST /frame`; both carry the frame JSON and `Authorization: Bearer <token>`. Exact app/dev origins are checked; preflight permits only POST and the two required headers. `/connect` assigns a consumer epoch and retires the prior one; old frames cannot re-activate it. Credentials never enter URLs, logs or portable output.

A frame may include a bounded `drawingStatus` string so the selector can show actual SDK fallback independently of sidecar readiness. Two seconds without consumer requests stops the optional child, allowing brief page replacement without overlapping consumers. A later disconnected client gets skeleton fallback/relaunch guidance rather than stalled input.

A successful frame response is the binary result packet. HTTP 204 means no usable mesh yet, with an exposed `x-xrb-mesh-status` reason. A superseded newest-pending request is released immediately. The child and SDK paths each hold at most one frame in flight plus one newest pending snapshot. The renderer never awaits a response in its draw/input loop.

Late (over 33 ms from dispatch), malformed, retired-revision/epoch or wrong-hand results are discarded. A previous mesh is drawable only while fresh and within 10 mm maximum keypoint displacement of its associated pose; otherwise draw the ordinary skeleton and show fallback. No detection/hand loss immediately invalidates geometry even during skeleton grace. A physically stuck child gets a two-second frame watchdog, rather than accumulating a FIFO. Keep source confidence separate from fit residuals; this minimum frame contract does not invent confidence.
