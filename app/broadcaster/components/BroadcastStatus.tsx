import React from "react";
import { motion } from "framer-motion";
import { BroadcastState } from "@/app/broadcaster/types/types";
interface BroadcastStatusProps {
  broadcastState: BroadcastState;
}

const BroadcastStatus: React.FC<BroadcastStatusProps> = ({ broadcastState }) => {
  return (
    <>
      {broadcastState.error && (
        <motion.p
          className="mt-3 text-red-400 text-sm text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {broadcastState.error}
        </motion.p>
      )}
      {broadcastState.isBroadcasting && (
        <p className="mt-3 text-sm text-gray-300 text-center">
          Viewers: {broadcastState.viewerCount}
        </p>
      )}
    </>
  );
};

export default BroadcastStatus;