import qaSchema from "../modelsShared/qaSchema.js";
import introSchema from "../modelsShared/introSchema.js";
import customerSessionSchema from "../modelsShared/customerSessionSchema.js";
import orderSchema from "../modelsShared/orderSchema.js";
import conversationSchema from "../modelsShared/conversationSchema.js";

export function createModelsForConnection(conn) {
  if (!conn) throw new Error("Missing tenant DB connection");

  if (!conn.models.QA) {
    conn.model("QA", qaSchema);
  }
  if (!conn.models.Intro) {
    conn.model("Intro", introSchema);
  }
  if (!conn.models.CustomerSession) {
    conn.model("CustomerSession", customerSessionSchema);
  }
  if (!conn.models.Order) {
    conn.model("Order", orderSchema);
  }
  if (!conn.models.Conversation) {
    conn.model("Conversation", conversationSchema);
  }

  return {
    QA: conn.models.QA,
    Intro: conn.models.Intro,
    CustomerSession: conn.models.CustomerSession,
    Order: conn.models.Order,
    Conversation: conn.models.Conversation,
  };
}
