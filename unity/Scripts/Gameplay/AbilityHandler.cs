using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace ChaosParcel.Gameplay
{
    /// <summary>
    /// Handles chaos ability triggers from mobile clients.
    /// </summary>
    public class AbilityHandler : MonoBehaviour
    {
        [SerializeField] private PlayerSpawner spawner;
        [SerializeField] private float freezeDuration = 2f;
        [SerializeField] private float magnetDuration = 3f;
        [SerializeField] private float confusionDuration = 3f;
        [SerializeField] private float shockwaveForce = 500f;
        [SerializeField] private float shockwaveRadius = 5f;
        [SerializeField] private Transform packageTransform;

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
            if (!json.Contains("ABILITY_TRIGGER")) return;

            var data = JsonUtility.FromJson<AbilityWrapper>(json);
            if (data?.payload == null) return;

            var targetId = data.payload.target_player_id;
            if (string.IsNullOrEmpty(targetId))
            {
                targetId = data.payload.player_id;
            }

            switch (data.payload.ability_type)
            {
                case "FREEZE":
                    StartCoroutine(ApplyFreeze(targetId));
                    break;
                case "SHOCKWAVE":
                    ApplyShockwave(targetId);
                    break;
                case "MAGNET":
                    StartCoroutine(ApplyMagnet(targetId));
                    break;
                case "CONFUSION":
                    StartCoroutine(ApplyConfusion(targetId));
                    break;
            }
        }

        private IEnumerator ApplyFreeze(string playerId)
        {
            var go = spawner.GetPlayer(playerId);
            if (go == null) yield break;

            var controller = go.GetComponent<PlayerController>();
            var rb = go.GetComponent<Rigidbody>();
            if (controller == null || rb == null) yield break;

            controller.SetFrozen(true);
            rb.velocity = Vector3.zero;

            yield return new WaitForSeconds(freezeDuration);

            controller.SetFrozen(false);
        }

        private void ApplyShockwave(string playerId)
        {
            var go = spawner.GetPlayer(playerId);
            if (go == null) return;

            var colliders = Physics.OverlapSphere(go.transform.position, shockwaveRadius);
            foreach (var col in colliders)
            {
                var rb = col.GetComponent<Rigidbody>();
                if (rb != null)
                {
                    rb.AddExplosionForce(shockwaveForce, go.transform.position, shockwaveRadius);
                }
            }
        }

        private IEnumerator ApplyMagnet(string playerId)
        {
            if (packageTransform == null) yield break;

            var go = spawner.GetPlayer(playerId);
            if (go == null) yield break;

            var rb = go.GetComponent<Rigidbody>();
            if (rb == null) yield break;

            var elapsed = 0f;
            while (elapsed < magnetDuration)
            {
                var direction = (packageTransform.position - go.transform.position).normalized;
                rb.AddForce(direction * 15f, ForceMode.Acceleration);
                elapsed += Time.fixedDeltaTime;
                yield return new WaitForFixedUpdate();
            }
        }

        private IEnumerator ApplyConfusion(string playerId)
        {
            var go = spawner.GetPlayer(playerId);
            if (go == null) yield break;

            var controller = go.GetComponent<PlayerController>();
            if (controller == null) yield break;

            controller.SetConfused(true);
            yield return new WaitForSeconds(confusionDuration);
            controller.SetConfused(false);
        }

        [System.Serializable]
        private class AbilityWrapper
        {
            public AbilityPayload payload;
        }

        [System.Serializable]
        private class AbilityPayload
        {
            public string player_id;
            public string ability_type;
            public string target_player_id;
        }
    }
}
