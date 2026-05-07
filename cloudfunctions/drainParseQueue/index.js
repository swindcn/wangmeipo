const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const limit = Math.max(1, Math.min(Number(event.limit || 5), 20))
  const now = new Date()
  const queuedResult = await db.collection("parse_tasks").where({
    status: "queued",
  }).limit(limit).get()

  const runnableTasks = queuedResult.data.filter((task) => {
    if (!task.nextRetryAt) {
      return true
    }

    return new Date(task.nextRetryAt).getTime() <= now.getTime()
  })

  const outcomes = []

  for (let index = 0; index < runnableTasks.length; index += 1) {
    const task = runnableTasks[index]

    try {
      const result = await cloud.callFunction({
        name: "runParsePipeline",
        data: {
          taskId: task._id,
          sourceId: task.sourceId,
          createdBy: "drain_parse_queue",
        },
      })

      outcomes.push({
        taskId: task._id,
        ok: true,
        result: result.result || {},
      })
    } catch (error) {
      outcomes.push({
        taskId: task._id,
        ok: false,
        error: error.message,
      })
    }
  }

  return {
    ok: true,
    processed: outcomes.length,
    outcomes,
  }
}
