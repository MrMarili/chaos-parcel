using System.Collections.Generic;
using UnityEngine;

namespace ChaosParcel.Gameplay
{
    /// <summary>
    /// Spawns ragdoll player prefabs when PLAYER_JOINED events arrive.
    /// </summary>
    public class PlayerSpawner : MonoBehaviour
    {
        [SerializeField] private GameObject playerPrefab;
        [SerializeField] private Transform spawnPoint;
        [SerializeField] private float spawnHeight = 8f;

        private readonly Dictionary<string, GameObject> _players = new();

        private void OnEnable()
        {
            if (Network.NetworkManager.Instance != null)
            {
                Network.NetworkManager.Instance.OnRawMessage += HandleMessage;
            }
        }

        private void OnDisable()
        {
            if (Network.NetworkManager.Instance != null)
            {
                Network.NetworkManager.Instance.OnRawMessage -= HandleMessage;
            }
        }

        private void HandleMessage(string json)
        {
            if (json.Contains("PLAYER_JOINED"))
            {
                var data = JsonUtility.FromJson<PlayerJoinedWrapper>(json);
                if (data?.payload?.player != null)
                {
                    SpawnPlayer(data.payload.player);
                }
            }
            else if (json.Contains("PLAYER_LEFT"))
            {
                var data = JsonUtility.FromJson<PlayerLeftWrapper>(json);
                if (data?.payload != null)
                {
                    RemovePlayer(data.payload.player_id);
                }
            }
        }

        public void SpawnPlayer(PlayerData player)
        {
            if (_players.ContainsKey(player.player_id)) return;
            if (playerPrefab == null) return;

            var origin = spawnPoint != null ? spawnPoint.position : Vector3.zero;
            origin.y += spawnHeight;

            var go = Instantiate(playerPrefab, origin, Quaternion.identity);
            go.name = $"Player_{player.nickname}";

            var controller = go.GetComponent<PlayerController>();
            if (controller != null)
            {
                controller.Initialize(player.player_id, player.nickname, ParseColor(player.character_color));
            }

            _players[player.player_id] = go;
        }

        public void RemovePlayer(string playerId)
        {
            if (_players.TryGetValue(playerId, out var go))
            {
                Destroy(go);
                _players.Remove(playerId);
            }
        }

        public GameObject GetPlayer(string playerId)
        {
            _players.TryGetValue(playerId, out var go);
            return go;
        }

        public IEnumerable<GameObject> GetAllPlayers() => _players.Values;

        private static Color ParseColor(string hex)
        {
            if (ColorUtility.TryParseHtmlString(hex, out var color))
                return color;
            return Color.white;
        }

        [System.Serializable]
        public class PlayerData
        {
            public string player_id;
            public string nickname;
            public string character_color;
        }

        [System.Serializable]
        private class PlayerJoinedWrapper
        {
            public PlayerJoinedPayload payload;
        }

        [System.Serializable]
        private class PlayerJoinedPayload
        {
            public PlayerData player;
        }

        [System.Serializable]
        private class PlayerLeftWrapper
        {
            public PlayerLeftPayload payload;
        }

        [System.Serializable]
        private class PlayerLeftPayload
        {
            public string player_id;
        }
    }
}
