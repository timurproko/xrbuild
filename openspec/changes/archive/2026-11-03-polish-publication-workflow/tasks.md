# Tasks

- [x] Move field helper/error visuals into shared design-system components and update panel fields/dropdowns to use them; verify invalid controls retain normal surfaces/focus while same-sized descriptive text changes to the error color.
- [x] Accept and preserve an intentionally empty publication slug through UI saves, manifest/API validation and URL construction; verify it resolves exactly to the publisher route-prefix root.
- [x] Add root-route file ownership to the production publisher; verify publish, republish, move, unpublish, collision handling, rollback and public status preserve every named child route.
- [x] Apply shared reveal/collapse behavior to the complete publication result block; verify successful Publish and Unpublish visibly change the block without replay during ordinary refreshes or affecting other destinations.
- [x] Extend focused regressions and run full Control Panel/publisher tests, browser smoke, strict OpenSpec, name and diff validation; verify validation, root publication and animated completion remain integrated and accessible.
