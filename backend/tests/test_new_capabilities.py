from backend.app.schemas.knowledge import DirectSearchRequest, DirectSearchResponse, SearchResultItem


def test_direct_search_schemas():
    req = DirectSearchRequest(query="pricing information", top_k=5)
    assert req.query == "pricing information"
    assert req.top_k == 5

    res = DirectSearchResponse(
        query="pricing information",
        total_results=1,
        results=[
            SearchResultItem(
                text="The Pro plan is $29/mo",
                score=0.92,
                source_name="Company Handbook",
            )
        ],
    )
    assert res.total_results == 1
    assert res.results[0].score == 0.92
