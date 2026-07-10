using UnityEngine;

namespace ChaosParcel.Gameplay
{
    /// <summary>
    /// Receives PLAYER_MOVE events and routes input to PlayerController instances.
    /// </summary>
    public class InputReceiver : MonoBehaviour
    {
        [SerializeField] private PlayerSpawner spawner;

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
            if (!json.Contains("PLAYER_MOVE")) return;

            var data = JsonUtility.FromJson<MoveWrapper>(json);
            if (data?.payload == null || spawner == null) return;

            var playerGo = spawner.GetPlayer(data.payload.player_id);
            if (playerGo == null) return;

            var controller = playerGo.GetComponent<PlayerController>();
            controller?.SetInput(data.payload.x, data.payload.y);
        }

        [System.Serializable]
        private class MoveWrapper
        {
            public MovePayload payload;
        }

        [System.Serializable]
        private class MovePayload
        {
            public string player_id;
            public float x;
            public float y;
        }
    }
}
