from fastapi.testclient import TestClient


class TestProjectsApi:
    def test_project_lifecycle_and_stage_version(self, client: TestClient) -> None:
        create_response = client.post("/api/projects", json={"name": "Evidence Review"})

        assert create_response.status_code == 201
        project = create_response.json()
        assert project["name"] == "Evidence Review"
        assert len(project["stages"]) == 9
        project_id = project["id"]

        save_response = client.put(
            f"/api/projects/{project_id}/stages/introduction",
            json={"contentHTML": "<p>Updated introduction</p>"},
        )
        assert save_response.status_code == 200
        introduction = self._find_stage(save_response.json(), "introduction")
        assert introduction["contentHTML"] == "<p>Updated introduction</p>"

        version_response = client.post(
            f"/api/projects/{project_id}/stages/introduction/versions",
            json={"contentHTML": "<p>Version one</p>"},
        )
        assert version_response.status_code == 201
        introduction = self._find_stage(version_response.json(), "introduction")
        assert len(introduction["versions"]) == 1
        assert isinstance(introduction["versions"][0]["id"], int)

        rename_response = client.patch(
            f"/api/projects/{project_id}",
            json={"name": "Renamed Review"},
        )
        assert rename_response.status_code == 200
        assert rename_response.json()["name"] == "Renamed Review"

        delete_response = client.delete(f"/api/projects/{project_id}")
        assert delete_response.status_code == 204
        assert client.get("/api/projects").json() == []

    def test_missing_project_returns_not_found(self, client: TestClient) -> None:
        response = client.delete("/api/projects/missing")

        assert response.status_code == 404

    def test_rollback_restores_version_and_snapshots_current_content(
        self,
        client: TestClient,
    ) -> None:
        project = client.post("/api/projects", json={"name": "Rollback Study"}).json()
        project_id = project["id"]
        stage_path = f"/api/projects/{project_id}/stages/discussion"

        version_response = client.post(
            f"{stage_path}/versions",
            json={"contentHTML": "<p>Version one</p>"},
        )
        discussion = self._find_stage(version_response.json(), "discussion")
        version_one_id = discussion["versions"][0]["id"]

        client.put(stage_path, json={"contentHTML": "<p>Current draft</p>"})
        rollback_response = client.post(f"{stage_path}/versions/{version_one_id}/restore")

        assert rollback_response.status_code == 200
        discussion = self._find_stage(rollback_response.json(), "discussion")
        assert discussion["contentHTML"] == "<p>Version one</p>"
        assert len(discussion["versions"]) == 2
        safety_version = discussion["versions"][-1]
        assert safety_version["html"] == "<p>Current draft</p>"

        undo_response = client.post(
            f"{stage_path}/versions/{safety_version['id']}/restore"
        )
        discussion = self._find_stage(undo_response.json(), "discussion")
        assert discussion["contentHTML"] == "<p>Current draft</p>"

    def test_missing_version_rollback_returns_not_found(self, client: TestClient) -> None:
        project = client.post("/api/projects", json={"name": "Missing Version"}).json()
        path = f"/api/projects/{project['id']}/stages/results/versions/999/restore"

        response = client.post(path)

        assert response.status_code == 404

    def _find_stage(self, project: dict, stage_id: str) -> dict:
        for stage in project["stages"]:
            if stage["stageId"] == stage_id:
                return stage
        raise AssertionError(f"Stage {stage_id} was not returned")
