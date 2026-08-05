import Foundation
import Vision
import Darwin

private struct HelperRequest: Decodable {
    let id: Int
    let imageBase64: String
}

private struct Landmark: Encodable {
    let x: Double
    let y: Double
    let confidence: Double
}

private struct HelperResponse: Encodable {
    let id: Int
    let landmarks: [Landmark]?
    let inferenceMs: Double
    let error: String?

    private enum CodingKeys: String, CodingKey {
        case id, landmarks, inferenceMs, error
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(inferenceMs, forKey: .inferenceMs)
        if let landmarks {
            try container.encode(landmarks, forKey: .landmarks)
        } else {
            try container.encodeNil(forKey: .landmarks)
        }
        if let error {
            try container.encode(error, forKey: .error)
        } else {
            try container.encodeNil(forKey: .error)
        }
    }
}

private let jointNames: [VNHumanHandPoseObservation.JointName] = [
    .wrist,
    .thumbCMC, .thumbMP, .thumbIP, .thumbTip,
    .indexMCP, .indexPIP, .indexDIP, .indexTip,
    .middleMCP, .middlePIP, .middleDIP, .middleTip,
    .ringMCP, .ringPIP, .ringDIP, .ringTip,
    .littleMCP, .littlePIP, .littleDIP, .littleTip,
]

private let encoder: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return encoder
}()

private func elapsedMilliseconds(since start: UInt64) -> Double {
    let elapsed = DispatchTime.now().uptimeNanoseconds - start
    return Double(elapsed) / 1_000_000
}

private func process(_ line: String) -> HelperResponse {
    let startedAt = DispatchTime.now().uptimeNanoseconds
    let request: HelperRequest
    do {
        guard let data = line.data(using: .utf8) else {
            return HelperResponse(id: 1, landmarks: nil, inferenceMs: 0, error: "请求编码无效")
        }
        request = try JSONDecoder().decode(HelperRequest.self, from: data)
    } catch {
        return HelperResponse(id: 1, landmarks: nil, inferenceMs: elapsedMilliseconds(since: startedAt), error: "请求格式无效")
    }

    guard request.id > 0 else {
        return HelperResponse(id: 1, landmarks: nil, inferenceMs: elapsedMilliseconds(since: startedAt), error: "请求编号无效")
    }
    guard let imageData = Data(base64Encoded: request.imageBase64), !imageData.isEmpty else {
        return HelperResponse(id: request.id, landmarks: nil, inferenceMs: elapsedMilliseconds(since: startedAt), error: "图像数据无效")
    }

    let visionRequest = VNDetectHumanHandPoseRequest()
    visionRequest.maximumHandCount = 1
    do {
        let handler = VNImageRequestHandler(data: imageData, options: [:])
        try handler.perform([visionRequest])
        guard let observation = visionRequest.results?.first else {
            return HelperResponse(id: request.id, landmarks: nil, inferenceMs: elapsedMilliseconds(since: startedAt), error: "未检测到手部")
        }

        let landmarks = try jointNames.map { jointName -> Landmark in
            let point = try observation.recognizedPoint(jointName)
            return Landmark(
                x: min(1, max(0, Double(point.location.x))),
                y: min(1, max(0, 1 - Double(point.location.y))),
                confidence: min(1, max(0, Double(point.confidence)))
            )
        }
        return HelperResponse(
            id: request.id,
            landmarks: landmarks,
            inferenceMs: elapsedMilliseconds(since: startedAt),
            error: nil
        )
    } catch {
        return HelperResponse(id: request.id, landmarks: nil, inferenceMs: elapsedMilliseconds(since: startedAt), error: "Vision 推理失败")
    }
}

private func write(_ response: HelperResponse) {
    guard let data = try? encoder.encode(response), let line = String(data: data, encoding: .utf8) else {
        print("{\"error\":\"响应编码失败\",\"id\":1,\"inferenceMs\":0,\"landmarks\":null}")
        return
    }
    print(line)
}

setbuf(stdout, nil)
while let line = readLine() {
    autoreleasepool {
        write(process(line))
    }
}
