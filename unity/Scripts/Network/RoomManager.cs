using System;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace ChaosParcel.Network
{
    /// <summary>
    /// Creates a room on connect and displays room code + join URL for QR.
    /// </summary>
    public class RoomManager : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI roomCodeText;
        [SerializeField] private TextMeshProUGUI joinUrlText;
        [SerializeField] private RawImage qrCodeImage;

        public string RoomCode { get; private set; }
        public string JoinUrl { get; private set; }

        public event Action<string> OnRoomCreated;

        private void OnEnable()
        {
            if (NetworkManager.Instance != null)
            {
                NetworkManager.Instance.OnRawMessage += HandleMessage;
                NetworkManager.Instance.OnConnected += OnHostConnected;
            }
        }

        private void OnDisable()
        {
            if (NetworkManager.Instance != null)
            {
                NetworkManager.Instance.OnRawMessage -= HandleMessage;
                NetworkManager.Instance.OnConnected -= OnHostConnected;
            }
        }

        private void OnHostConnected()
        {
            if (NetworkManager.Instance.IsConnected)
            {
                NetworkManager.Instance.SendRoomCreate();
            }
        }

        private void HandleMessage(string json)
        {
            if (!json.Contains("ROOM_CREATED")) return;

            var payload = JsonUtility.FromJson<RoomCreatedWrapper>(WrapEvent(json));
            if (payload?.payload == null) return;

            RoomCode = payload.payload.room_code;
            JoinUrl = payload.payload.join_url;

            if (roomCodeText != null) roomCodeText.text = RoomCode;
            if (joinUrlText != null) joinUrlText.text = JoinUrl;

            OnRoomCreated?.Invoke(RoomCode);
        }

        private static string WrapEvent(string json)
        {
            return json;
        }

        [Serializable]
        private class RoomCreatedWrapper
        {
            public string @event;
            public RoomCreatedPayload payload;
        }

        [Serializable]
        private class RoomCreatedPayload
        {
            public string room_code;
            public string join_url;
        }
    }
}
